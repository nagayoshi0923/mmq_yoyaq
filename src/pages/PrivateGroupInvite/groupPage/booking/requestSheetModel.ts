/**
 * 店舗への申込シート（見本 RequestSheet.dc.html の B）の組み立て。純粋な関数だけを置く。
 * 候補日を複数選び、選んだ順＝優先順で送る。店舗はこの中から 1 つを確定する。
 * 送信は従来どおり submitBookingRequest.ts（create_private_booking_request_with_notice）。
 */
import { addJstDays } from '@/utils/jstDate'
import type { CandidateSlotAvailabilityRow } from '@/lib/candidateSlotAvailability'
import { candidateSlotReasonText } from '@/lib/candidateSlotAvailability'
import type { AnswerColumn, AnswerRow, AnswerTable } from '../groupPageModel'

/** 一度に送れる候補日の数（従来の申込と同じ） */
export const MAX_REQUEST_DATES = 6

export type SlotKey = 'morning' | 'afternoon' | 'evening'

export interface SheetCandidate {
  id: string
  date: string
  slotKey: SlotKey | null
  /** 「10/23(金) 午後 13:00〜18:00」 */
  label: string
  /** 「○3」「○2 △1」 */
  tally: string
  /** 「全員参加できる」「三郎さんが△」 */
  note: string
  ok: number
  maybe: number
  ng: number
  /** × の人がいる */
  hasNg: boolean
  startTime: string
}

/** DB の時間帯の書き方（午前・朝・morning など）をそろえる */
export function slotKeyOf(raw: string | null | undefined): SlotKey | null {
  switch (raw) {
    case 'morning': case '朝': case '午前': case '朝公演':
      return 'morning'
    case 'afternoon': case '昼': case '午後': case '昼公演':
      return 'afternoon'
    case 'evening': case '夜': case '夜間': case '夜公演':
      return 'evening'
    default:
      return null
  }
}

const who = (c: AnswerColumn) => (c.isMe ? 'あなた' : `${c.name}さん`)

/** 候補日の補足。全員○なら「全員参加できる」、× の人がいればその人、無ければ △、無ければ未回答の人 */
export function candidateNote(row: AnswerRow, columns: ReadonlyArray<AnswerColumn>): string {
  if (columns.length > 0 && row.ok === columns.length) return '全員参加できる'
  const of = (value: 'ng' | 'maybe' | null) => columns.filter(c => (row.cells[c.memberId] ?? null) === value).map(who)
  const ng = of('ng')
  if (ng.length) return `${ng.join('・')}が×`
  const maybe = of('maybe')
  if (maybe.length) return `${maybe.join('・')}が△`
  const none = of(null)
  return none.length ? `${none.join('・')}が未回答` : ''
}

/** 申込シートに並べる候補日（店舗が見送った日は除く。並びは回答表と同じ日付順） */
export function sheetCandidates(
  table: AnswerTable,
  dates: ReadonlyArray<{ id: string; time_slot: string; end_time?: string | null }>,
): SheetCandidate[] {
  return table.rows.filter(r => !r.rejected).map(row => {
    const raw = dates.find(d => d.id === row.id)
    const end = (raw?.end_time ?? '').slice(0, 5)
    return {
      id: row.id,
      date: row.date,
      slotKey: slotKeyOf(raw?.time_slot),
      label: `${row.dateLabel} ${row.slotLabel} ${row.startTime}${end ? `〜${end}` : ''}`,
      tally: [row.ok ? `○${row.ok}` : '', row.maybe ? `△${row.maybe}` : '', row.ng ? `×${row.ng}` : ''].filter(Boolean).join(' ') || '回答なし',
      note: candidateNote(row, table.columns),
      ok: row.ok,
      maybe: row.maybe,
      ng: row.ng,
      hasNg: row.ng > 0,
      startTime: row.startTime,
    }
  })
}

/**
 * 最初に選んでおく候補日（優先順）。全員○の日と、それ以外で○が最も多い日（見本: ○3 の日と ○2 △1 の日）。
 * 並びは ○ の多い順 → × の少ない順 → △ の多い順 → 日付の早い順。選べない日（空きなし）は外す。
 */
export function initialPicks(candidates: ReadonlyArray<SheetCandidate>, memberCount: number, isBlocked: (id: string) => boolean = () => false): string[] {
  const open = candidates.filter(c => !isBlocked(c.id))
  const allOk = (c: SheetCandidate) => memberCount > 0 && c.ok === memberCount
  const maxOk = Math.max(0, ...open.filter(c => !allOk(c)).map(c => c.ok))
  return open
    .filter(c => allOk(c) || (maxOk > 0 && c.ok === maxOk))
    .sort((a, b) => b.ok - a.ok || a.ng - b.ng || b.maybe - a.maybe || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, MAX_REQUEST_DATES)
    .map(c => c.id)
}

/** チェックの切り替え。新しく選んだ日は末尾（いちばん低い優先）に足す。上限を超えるときは null */
export function togglePick(picks: ReadonlyArray<string>, id: string, max = MAX_REQUEST_DATES): string[] | null {
  if (picks.includes(id)) return picks.filter(p => p !== id)
  if (picks.length >= max) return null
  return [...picks, id]
}

/** 優先順の入れ替え（from の位置の日を to の位置へ） */
export function movePick(picks: ReadonlyArray<string>, from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= picks.length || to >= picks.length) return [...picks]
  const next = [...picks]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** 参加人数の初期値: 登録メンバー数を作品の最低〜最大人数に収めたもの */
export function defaultParticipants(members: number, min: number | null, max: number | null): number {
  const lo = min && min > 0 ? min : 1
  const hi = max && max >= lo ? max : Math.max(lo, members)
  return Math.min(hi, Math.max(lo, members))
}

/** 「登録メンバー 4 名＋当日来る 2 名」 */
export function participantsNote(count: number, members: number): string {
  if (count > members) return `登録メンバー ${members} 名＋当日来る ${count - members} 名`
  if (count < members) return `登録メンバー ${members} 名より少ない人数です`
  return `登録メンバー ${members} 名`
}

// ─── 店舗ごとの空き（#1021/#1023 の判定 private_booking_candidate_slot_availability を店舗 1 つずつ） ───

export interface StoreSlotState {
  available: boolean
  /** 選べない理由（短い日本語） */
  reason: string | null
  /** その店舗で始められる時刻（「13:00」。前後の公演から逆算して標準からずれることがある） */
  startTime?: string | null
  /** 標準の開始時刻では入らず、ずらした時刻を返した */
  adjusted?: boolean
}

/** 店舗 id → `${date}|${slot}` → 空き */
export type StoreAvailability = Record<string, Record<string, StoreSlotState>>

export const slotStateKey = (date: string, slot: SlotKey) => `${date}|${slot}`

export function toStoreAvailability(rowsByStore: Record<string, CandidateSlotAvailabilityRow[]>): StoreAvailability {
  const out: StoreAvailability = {}
  for (const [storeId, rows] of Object.entries(rowsByStore)) {
    const map: Record<string, StoreSlotState> = {}
    for (const row of rows) {
      const slot = slotKeyOf(row.time_slot)
      if (!slot) continue
      map[slotStateKey(String(row.date).slice(0, 10), slot)] = {
        available: Boolean(row.available && row.start_time),
        reason: row.available ? null : candidateSlotReasonText(row.reason) + (row.detail ? `（${row.detail}）` : ''),
        startTime: row.start_time ? row.start_time.slice(0, 5) : null,
        adjusted: row.adjusted === true,
      }
    }
    out[storeId] = map
  }
  return out
}

/** 読み込む期間（DB は 1 回 62 日まで）。候補日の日付をまとめて、60 日以内の区間に分ける */
export function availabilityWindows(dates: ReadonlyArray<string>): Array<{ from: string; to: string }> {
  const sorted = [...new Set(dates)].sort()
  const out: Array<{ from: string; to: string }> = []
  for (const d of sorted) {
    const last = out[out.length - 1]
    if (last && d <= addJstDays(last.from, 60)) last.to = d
    else out.push({ from: d, to: d })
  }
  return out
}

/**
 * その店舗のその候補日の空き（読めていなければ null＝分からない）。
 * 候補日の開始時刻は登録時に決まっている。いまは標準の開始時刻では入らず別の時刻にずらされる（前後に公演が入った）のに、
 * 候補日の開始時刻がその時刻と違うときは、候補日の時刻では入らないとみなす。
 * 標準の時刻で入るときは、候補日が登録時にずらした時刻でも入るかは分からないので空きありのまま（送信時の確認と DB に任せる）。
 */
export function storeSlot(availability: StoreAvailability | null, storeId: string, c: Pick<SheetCandidate, 'date' | 'slotKey'> & { startTime?: string }): StoreSlotState | null {
  if (!availability || !c.slotKey) return null
  const state = availability[storeId]?.[slotStateKey(c.date, c.slotKey)] ?? null
  if (state?.available && state.adjusted && state.startTime && c.startTime && state.startTime !== c.startTime.slice(0, 5)) {
    return { available: false, reason: `この時刻は空きがありません（${state.startTime} 開始なら空きあり）`, startTime: state.startTime }
  }
  return state
}

/** 希望店舗のどこにも空きが無い候補日の理由（空きがある・分からないときは null） */
export function candidateBlockedReason(availability: StoreAvailability | null, storeIds: ReadonlyArray<string>, c: Pick<SheetCandidate, 'date' | 'slotKey'> & { startTime?: string }): string | null {
  if (!availability || storeIds.length === 0) return null
  const states = storeIds.map(id => storeSlot(availability, id, c))
  if (states.some(s => s === null || s.available)) return null
  const reasons = [...new Set(states.map(s => s?.reason).filter(Boolean))]
  return reasons.length === 1 ? reasons[0]! : '希望店舗はどこも空きがありません'
}

export interface StoreChipState {
  id: string
  name: string
  /** 選んだ候補日のどれにも空きが無い（灰色・選べない） */
  disabled: boolean
  /** 一部の候補日だけ空きが無いときの日付（「10/30(金)」） */
  partialDates: string[]
}

/** 希望店舗のチップの状態。選んだ候補日がまだ無いときは全部選べる */
export function storeChips(
  stores: ReadonlyArray<{ id: string; name: string }>,
  picked: ReadonlyArray<SheetCandidate>,
  availability: StoreAvailability | null,
): StoreChipState[] {
  return stores.map(store => {
    const states = picked.map(c => ({ c, s: storeSlot(availability, store.id, c) }))
    const closed = states.filter(x => x.s !== null && !x.s.available)
    const disabled = picked.length > 0 && closed.length === picked.length
    return { id: store.id, name: store.name, disabled, partialDates: disabled ? [] : closed.map(x => x.c.label.split(' ')[0]) }
  })
}

/** 送る店舗: 選んだ店舗のうち、選べない（空きなし）店舗を除いたもの。並びはグループの希望店舗の順 */
export function storesToSend(chips: ReadonlyArray<StoreChipState>, selected: ReadonlySet<string>): string[] {
  return chips.filter(c => !c.disabled && selected.has(c.id)).map(c => c.id)
}
