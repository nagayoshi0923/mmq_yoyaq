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

// セル内改行で分断された行を前の行に結合する。
// 日付/ヘッダー/店舗名/空行で始まる行を「新しい行」とみなし、それ以外は直前の行へ連結する
// （引用符で囲まれていないセル内改行への対処）。
export function mergeWrappedLines(rawLines: string[]): string[] {
  const lines: string[] = []
  const datePattern = /^\d{1,2}\/\d{1,2}/  // MM/DD形式
  const headerPattern = /^(日付|曜日|\s*$)/  // ヘッダー行
  const venuePattern = /^\t*\t(馬場|大久保|大塚|別館|出張|ゲムマ|SME|制作|別会場)/  // 店舗で始まる行

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const trimmed = line.trim()

    // 行が日付、ヘッダー、空白、または店舗名で始まる場合は新しい行
    const isNewRow = datePattern.test(trimmed) ||
                     headerPattern.test(trimmed) ||
                     venuePattern.test(line) ||
                     trimmed === ''

    if (isNewRow || lines.length === 0) {
      lines.push(line)
    } else {
      // 前の行に結合（スペースで区切る）
      lines[lines.length - 1] += ' ' + trimmed
    }
  }

  return lines
}

// 取込対象の年月を行データから特定する。
// 最初に見つかった日付セル（M/D / YYYY/M/D / M/D/YYYY）から判定。見つからなければ表示中の年月。
export function detectTargetMonth(
  lines: string[],
  displayYear: number,
  displayMonth: number,
): { year: number; month: number } {
  let targetMonth: { year: number; month: number } | null = null

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

  return targetMonth
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
