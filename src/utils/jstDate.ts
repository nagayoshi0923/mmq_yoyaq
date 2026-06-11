/**
 * 日本時間(JST / Asia/Tokyo)固定の日付フォーマット。
 *
 * このアプリは日本の店舗向けで、日付・時刻は常に日本時間で表示すべき。
 * `new Date(str).getDate()` や timeZone 指定なしの `toLocaleDateString` は
 * 「見ている人のブラウザのタイムゾーン」に依存するため、非JST環境の利用者には
 * 日付が±1日ずれて表示される（実際に貸切予約で 11/30 が 11/29 と見えた）。
 * Edge Function(Deno) は常に UTC 実行なので、メール文面でも必ずずれる。
 *
 * 入力の揺れ（日付のみ / オフセット付きISO / UTC / オフセット無し / Date）を吸収し、
 * 必ず Asia/Tokyo の暦日・時刻で整形する。
 *
 * ── 顧客向けページの表示ルール（2026-06 統一） ──────────────
 *   これからの公演日（一覧・カード）   → formatJstMonthDay(date, true)  例: 7/1(火)
 *   詳細・確認画面の公演日             → formatJstDateJa(date, true)    例: 2026年7月1日(火)
 *   履歴・期限・登録日など年が重要な日付 → formatJstDateJa(date)          例: 2026年7月1日
 *   「2026/07/01」形式(formatJstYmd)は顧客向け画面では使わない（CSV等のデータ用途のみ）
 */

const JST = 'Asia/Tokyo'

/** 文字列/Date を「JSTで解釈した」Date(瞬間) に正規化する */
function toInstant(value: string | Date | null | undefined): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const s = String(value).trim()
  if (!s) return null
  // 日付のみ(YYYY-MM-DD): JST の 0時として扱う
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00+09:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // オフセット(Z / +09:00 等)が無い naive な日時は JST の壁時計として扱う
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTz ? s : `${s}+09:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** JST の年月日時分・曜日を取り出す（全て2桁ゼロ埋め。weekday は「月」等） */
export function getJstParts(value: string | Date | null | undefined) {
  const d = toInstant(value)
  if (!d) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: JST, weekday: 'short' }).format(d)
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), weekday }
}

/** "2026/11/30"（区切り文字は指定可） */
export function formatJstYmd(value: string | Date | null | undefined, sep = '/'): string {
  const t = getJstParts(value)
  return t ? `${t.y}${sep}${t.mo}${sep}${t.d}` : ''
}

/** "2026年11月30日" / withWeekday=true で "2026年11月30日(月)" */
export function formatJstDateJa(value: string | Date | null | undefined, withWeekday = false): string {
  const t = getJstParts(value)
  if (!t) return ''
  const base = `${Number(t.y)}年${Number(t.mo)}月${Number(t.d)}日`
  return withWeekday ? `${base}(${t.weekday})` : base
}

/** "11/30" / withWeekday=true で "11/30(月)"（先頭ゼロなし） */
export function formatJstMonthDay(value: string | Date | null | undefined, withWeekday = false): string {
  const t = getJstParts(value)
  if (!t) return ''
  const base = `${Number(t.mo)}/${Number(t.d)}`
  return withWeekday ? `${base}(${t.weekday})` : base
}

/** "2026/11/30 13:00" */
export function formatJstDateTime(value: string | Date | null | undefined): string {
  const t = getJstParts(value)
  return t ? `${t.y}/${t.mo}/${t.d} ${t.h}:${t.mi}` : ''
}

/** "13:00" */
export function formatJstTime(value: string | Date | null | undefined): string {
  const t = getJstParts(value)
  return t ? `${t.h}:${t.mi}` : ''
}

/** JST の曜日（"月" 等。0=日 の数値が欲しい時は getJstWeekdayIndex） */
export function formatJstWeekday(value: string | Date | null | undefined): string {
  const t = getJstParts(value)
  return t ? t.weekday : ''
}

/** JST の曜日インデックス（0=日 … 6=土）。営業時間・週末判定用 */
export function getJstWeekdayIndex(value: string | Date | null | undefined): number | null {
  const d = toInstant(value)
  if (!d) return null
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: JST, weekday: 'short' }).format(d)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
}

/** JST 暦日の "YYYY-MM-DD"（input value やキー用） */
export function toJstYmd(value: string | Date | null | undefined): string {
  const t = getJstParts(value)
  return t ? `${t.y}-${t.mo}-${t.d}` : ''
}
