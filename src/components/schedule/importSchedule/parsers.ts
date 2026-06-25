/**
 * ImportScheduleModal のパース純関数（副作用なし・テスト対象）
 *
 * ImportScheduleModal 本体から抽出（Phase 5-2a・挙動不変）。
 * TSV パース・タイトルからの時刻抽出・日付正規化など、入力のみに依存する純関数群。
 */

// 引用符として認識する文字（ASCII、スマートクォート、日本語引用符など）
const QUOTE_CHARS = new Set(['"', '"', '"', '「', '」', '『', '』'])
export const isQuote = (char: string): boolean => QUOTE_CHARS.has(char)

// セル内改行を含むTSVを正しくパースする（行を分割）
export function parseTsvLines(text: string): string[] {
  const result: string[] = []
  let currentLine = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (isQuote(char)) {
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

// 行をタブ区切りでセルに分割（引用符内のタブも考慮）
export function parseTsvCells(line: string): string[] {
  const cells: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (isQuote(char)) {
      inQuotes = !inQuotes
      // 引用符自体は含めない（後で除去）
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

// タイトル末尾の (開始-終了) から時刻を抽出（例: "(13-17)" → 13:00-17:00 / "(9.5-12)" → 09:30-12:00）
export function parseTimeFromTitle(title: string): { start: string; end: string } | null {
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
      end: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
    }
  }
  return null
}

// "M/D" 形式の日付文字列を、指定年付きの "YYYY-MM-DD" に変換する。形式不正なら空文字。
// ※ 元実装は year 未指定時に currentDisplayDate へフォールバックしていたが、
//   呼び出し側が常に表示年を渡すため、純関数化にあたり year を必須にした（挙動同一）。
export function parseDate(dateStr: string, year: number): string {
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
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
