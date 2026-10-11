/**
 * 参加前の招待ページに出す「このグループのいま」（点検 51）。
 * 招待リンクを開いただけの人（preview）が読める範囲（グループの状態・候補日・作品の料金）だけで組み立てる。
 * 確定した日時・会場は参加前には読めない（private_group_read_snapshot の preview は確定公演を返さない決まり）ので、
 * 確定のときは「参加後に確認できます」と書く。
 */
import { formatJstMonthDay } from '@/utils/jstDate'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'
import type { ParticipationCost } from '@/pages/ScenarioDetailPage/utils/pricingUtils'
import type { PrivateGroupProgress } from '@/components/patterns/privateGroup/privateGroupScheduleRules'
import { priceSummary, yenRange } from './groupPage/overviewModel'

export const INVITE_PREVIEW_MAX_DATES = 6

export interface InvitePreview {
  progress: PrivateGroupProgress
  /** 「募集中」「店舗の返事待ち」「確定」 */
  statusLabel: string
  statusClass: string
  /** 状態の 1 文 */
  statusText: string
  /** 候補日の見出し（確定のときは null） */
  datesTitle: string | null
  /** 「10/30(金) 午後 13:00」 */
  dates: string[]
  /** 出しきれなかった候補日の数 */
  moreDates: number
  /** 1 人あたりの料金（「¥4,500」「¥4,500〜¥5,000」）。分からなければ null */
  perPerson: string | null
  /** 料金の補足 */
  priceNote: string | null
}

interface PreviewInput {
  progress: PrivateGroupProgress
  candidates: ReadonlyArray<{ date: string; time_slot: string; start_time: string; status?: string | null }>
  /** 確定時にグループへ保存された 1 人あたり（あれば正） */
  savedPerPerson: number | null | undefined
  fee: number | null | undefined
  costs: ParticipationCost[] | null | undefined
  isCustomHoliday?: (date: string) => boolean
}

const STATUS: Record<PrivateGroupProgress, { label: string; cls: string; text: string }> = {
  gathering: {
    label: '募集中',
    cls: 'bg-purple-100 text-purple-800',
    text: '日程を調整しています。参加すると、候補日ごとに都合（○△×）を回答できます。',
  },
  requested: {
    label: '店舗の返事待ち',
    cls: 'bg-amber-100 text-amber-800',
    text: '主催者が店舗に申し込み済みです。日程の回答は締め切っています。店舗が日程を確定するとお知らせが届きます。',
  },
  confirmed: {
    label: '確定',
    cls: 'bg-green-100 text-green-800',
    text: '日程は確定しています。日時と会場は、参加後にグループページで確認できます。',
  },
}

export function buildInvitePreview(input: PreviewInput): InvitePreview {
  const status = STATUS[input.progress]
  const active = [...input.candidates]
    .filter(c => c.status !== 'rejected')
    .sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)))
  const showDates = input.progress !== 'confirmed'
  const labels = showDates
    ? active.map(c => [formatJstMonthDay(c.date, true), candidateTimeSlotFromDb(c.time_slot), (c.start_time ?? '').slice(0, 5)].filter(Boolean).join(' '))
    : []

  let perPerson: string | null = null
  let priceNote: string | null = null
  if (input.savedPerPerson && input.savedPerPerson > 0) {
    perPerson = yenRange(input.savedPerPerson, input.savedPerPerson)
  } else {
    const price = priceSummary({
      phase: 'pre_request',
      fee: input.fee ?? null,
      costs: input.costs ?? [],
      people: 1,
      candidates: active.map(c => ({ date: c.date, startTime: (c.start_time ?? '').slice(0, 5) })),
      confirmed: null,
      savedPerPerson: null,
      isCustomHoliday: input.isCustomHoliday,
    })
    if (price) {
      perPerson = yenRange(price.perPersonMin, price.perPersonMax)
      priceNote = price.perPersonMin !== price.perPersonMax ? '候補日（平日・土日祝など）によって変わります。確定した日の料金になります。' : null
    }
  }

  return {
    progress: input.progress,
    statusLabel: status.label,
    statusClass: status.cls,
    statusText: status.text,
    datesTitle: showDates ? (input.progress === 'requested' ? '候補日（店舗がこの中から確定します）' : '候補日') : null,
    dates: labels.slice(0, INVITE_PREVIEW_MAX_DATES),
    moreDates: Math.max(0, labels.length - INVITE_PREVIEW_MAX_DATES),
    perPerson,
    priceNote,
  }
}
