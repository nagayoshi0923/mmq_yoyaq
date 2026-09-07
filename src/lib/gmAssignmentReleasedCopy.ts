import { formatJstMonthDay } from '@/utils/jstDate'

export type GmAssignmentReleasedKind =
  | 'performance_cancelled'
  | 'private_cancelled_store'
  | 'gm_changed'

export type GmAssignmentReleasedCopyInput = {
  kind: GmAssignmentReleasedKind
  date?: string | null
  startTime?: string | null
  endTime?: string | null
  storeName?: string | null
  scenarioTitle?: string | null
  reason?: string | null
  customerName?: string | null
}

function clock(value?: string | null): string {
  const s = (value || '').trim()
  if (!s) return ''
  const hm = s.match(/^(\d{1,2}):(\d{2})/)
  if (hm) return `${String(parseInt(hm[1], 10)).padStart(2, '0')}:${hm[2]}`
  return s.length >= 5 ? s.slice(0, 5) : s
}

export function formatReleasedDateTime(date?: string | null, startTime?: string | null, endTime?: string | null): string {
  const day = date ? formatJstMonthDay(date, true) : ''
  const start = clock(startTime)
  const end = clock(endTime)
  const time = start && end ? `${start}〜${end}` : start
  return [day, time].filter(Boolean).join(' ')
}

export function buildGmAssignmentReleasedBody(input: GmAssignmentReleasedCopyInput): string {
  const datetime = formatReleasedDateTime(input.date, input.startTime, input.endTime) || '日時未定'
  const storeName = (input.storeName || '').trim() || '店舗不明'
  const scenarioTitle = (input.scenarioTitle || '').trim() || 'シナリオ未定'
  const reason = (input.reason || '').trim()

  if (input.kind === 'gm_changed') {
    return [
      '担当が変更になりました。',
      '',
      '担当変更',
      `日時　　${datetime}`,
      `店舗　　${storeName}`,
      `シナリオ　${scenarioTitle}`,
      '理由　　店舗操作で解除されました',
    ].join('\n')
  }

  if (input.kind === 'private_cancelled_store') {
    const customerName = (input.customerName || '').trim() || '顧客'
    return [
      '貸切がキャンセルされました。',
      '',
      '貸切キャンセル（店舗操作）',
      `日時　　${datetime}`,
      `店舗　　${storeName}`,
      `シナリオ　${scenarioTitle}`,
      `お客様　${customerName}`,
      `理由　　${reason || '店舗操作によるキャンセル'}`,
    ].join('\n')
  }

  return [
    '公演が中止になりました。',
    '',
    '公演中止',
    `日時　　${datetime}`,
    `店舗　　${storeName}`,
    `シナリオ　${scenarioTitle}`,
    `理由　　${reason || 'やむを得ない事情により公演を中止'}`,
  ].join('\n')
}

export function removedGmNames(previous: string[] | null | undefined, next: string[] | null | undefined): string[] {
  const prev = new Set((previous ?? []).map((name) => name.trim()).filter(Boolean))
  const kept = new Set((next ?? []).map((name) => name.trim()).filter(Boolean))
  return [...prev].filter((name) => !kept.has(name))
}
