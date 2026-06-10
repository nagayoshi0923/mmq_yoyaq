#!/usr/bin/env node
/**
 * JST 日付ガード
 *
 * 日付/時刻を `toLocaleDateString/toLocaleTimeString/toLocaleString('ja-JP', ...)` で
 * 整形する際に `timeZone: 'Asia/Tokyo'` を付け忘れると、非JST環境の利用者や
 * UTC実行(Edge Function)で日付が±1日ずれる。過去に貸切で 11/30 が 11/29 と表示され
 * 顧客が申込日を誤認する事故が起きた。日付表示は src/utils/jstDate.ts を使うのが原則。
 *
 * このガードは timeZone 指定なしの日付整形を検出して CI を落とす。
 * - toLocaleDateString / toLocaleTimeString → 必ず日付/時刻なので常に対象
 * - toLocaleString → 日付系オプション(year/month/day/weekday/hour/minute)がある時だけ対象
 *   （価格などの数値 `price.toLocaleString('ja-JP')` は対象外）
 * 意図的な例外（カレンダーのグリッド構築など）は行末/直前行に `// jst-ignore` を付ける。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// フロント(src)に加え、Edge Function(supabase/functions・Deno=UTC実行)も対象にする。
// Edge Function は常に UTC で動くため、timeZone 無しの整形は全受信者でズレる。
const ROOTS = ['src', 'supabase/functions']
const DATE_OPT_KEYS = /\b(year|month|day|weekday|hour|minute|second)\b/
const IGNORE = 'jst-ignore'

/** *.ts / *.tsx を再帰列挙 */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const violations = []

const allFiles = ROOTS.flatMap((r) => walk(r))
for (const file of allFiles) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const re = /\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\(\s*['"]ja-JP['"]/g

  let m
  while ((m = re.exec(src)) !== null) {
    const method = m[1]
    // 呼び出し位置の行番号
    const lineNo = src.slice(0, m.index).split('\n').length
    // オプションブロックを近傍(同行＋後続10行)から拾う
    const block = lines.slice(lineNo - 1, lineNo + 10).join('\n')
    const callLine = lines[lineNo - 1] ?? ''
    const prevLine = lines[lineNo - 2] ?? ''

    // 明示的な除外コメント
    if (callLine.includes(IGNORE) || prevLine.includes(IGNORE)) continue

    // すでに timeZone を指定していれば OK
    if (/timeZone:\s*['"]Asia\/Tokyo['"]/.test(block)) continue

    // toLocaleString は日付系オプションがある時だけ対象（数値整形は除外）
    if (method === 'toLocaleString' && !DATE_OPT_KEYS.test(block)) continue

    violations.push({ file, lineNo, method, text: callLine.trim() })
  }

  // パターン2: new Date(値).getDate()/getMonth()/getDay()/getFullYear()/getHours()/getMinutes()
  // 単一引数の new Date(...) をローカルTZのゲッターで読む＝保存値表示でのズレ要因。
  // 多引数 new Date(y,m,d)（グリッド構築）と new Date()（現在時刻）は除外。
  const getterRe = /new Date\(\s*[^),\s][^),]*\)\.(getDate|getMonth|getDay|getFullYear|getHours|getMinutes)\(\)/g
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    // コメント行・除外指定はスキップ
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    if (line.includes(IGNORE) || (lines[i - 1] ?? '').includes(IGNORE)) continue
    let g
    getterRe.lastIndex = 0
    while ((g = getterRe.exec(line)) !== null) {
      violations.push({ file, lineNo: i + 1, method: `new Date(...).${g[1]}`, text: trimmed })
    }
  }
}

if (violations.length === 0) {
  console.log('✅ JST日付ガード: timeZone指定なしの日付整形はありません')
  process.exit(0)
}

console.error(`❌ JST日付ガード: ${violations.length}件の timeZone 未指定の日付整形が見つかりました\n`)
for (const v of violations) {
  console.error(`  ${v.file}:${v.lineNo}  ${v.method}`)
  console.error(`     ${v.text}`)
}
console.error(`
💡 修正方法:
  1. src/utils/jstDate.ts の formatJstDateJa / formatJstYmd / formatJstMonthDay /
     formatJstDateTime / formatJstTime 等を使う（推奨）
  2. やむを得ず toLocale系を使う場合は options に timeZone: 'Asia/Tokyo' を付ける
  3. カレンダーのグリッド構築など意図的な例外は行末に // jst-ignore を付ける
`)
process.exit(1)
