/**
 * 公演スケジュールの下書き自動作成（QW-20261113-001）。
 *
 * 店舗の「固定枠」（曜日×時間帯で開ける枠）のうち、まだ公演が入っていない枠に、
 * 予約の入りやすさ・新作かどうか・その店舗で回せるか・同じ作品が続かないか を見て作品を当てる。
 * GM はここでは決めない（下書きを OK したあと、回せる GM に出勤を募集する）。
 *
 * 画面や DB に依存しない純粋な関数だけを置く（テストしやすくするため）。
 */
import { addJstDays, getJstWeekdayIndex } from '@/utils/jstDate'
import { scheduleTimeSlotToEn, startTimeToEn, type TimeSlotEn } from '@/lib/timeSlot'

export const AUTO_DRAFT_SLOTS: readonly TimeSlotEn[] = ['morning', 'afternoon', 'evening'] as const

/** 祝日の固定枠に使う weekday の値（0=日 … 6=土 の次） */
export const HOLIDAY_WEEKDAY = 7

/** 同じ店舗で同じ作品を空ける日数（この日数以内には同じ作品を入れない） */
export const SAME_STORE_GAP_DAYS = 7

export interface SlotRule {
  store_id: string
  weekday: number
  time_slot: TimeSlotEn
  is_open: boolean
}

export interface DraftScenario {
  scenario_master_id: string
  organization_scenario_id: string | null
  title: string
  /** 平日の公演時間（分） */
  duration_minutes: number
  /** 土日祝の公演時間（分）。無ければ平日と同じ */
  weekend_duration_minutes: number | null
  max_participants: number
  /** 同じ日に同時に使えるキットの数 */
  kit_count: number
  /** 公演できる店舗（空なら全店舗） */
  available_stores: string[]
  available_from: string | null
  available_until: string | null
  /** メインGMを担当できる在籍スタッフの人数 */
  main_gm_count: number
  /** 予約の入りやすさ（0〜1） */
  demand_score: number
  /** 新作（最近公演できるようになった作品） */
  is_new: boolean
}

export interface ExistingEvent {
  date: string
  store_id: string
  time_slot: string | null
  start_time: string | null
  /** 分かれば実時間の重なりを確かめる */
  end_time?: string | null
  scenario_master_id: string | null
}

export interface BlockedSlot {
  date: string
  store_id: string
  time_slot: TimeSlotEn
}

export interface DraftProposal {
  key: string
  date: string
  store_id: string
  time_slot: TimeSlotEn
  start_time: string
  end_time: string
  /** 時間帯の既定の終了時刻（作品を入れ替えたときに終了時刻を出し直すのに使う） */
  slot_end_time: string
  /** 土日祝か（土日祝の公演時間を使う） */
  is_weekend: boolean
  /** 当てた作品。条件に合う作品が無ければ null */
  scenario: DraftScenario | null
  /** 入れ替え候補（点数の高い順、当てた作品は含まない） */
  alternatives: DraftScenario[]
  /** 選んだ理由（画面に出す短い説明） */
  reasons: string[]
}

export interface GenerateDraftInput {
  /** 下書きを作る日付（YYYY-MM-DD、昇順） */
  dates: string[]
  storeIds: string[]
  rules: SlotRule[]
  /** 祝日（独自休日を含む）の日付 */
  holidays: ReadonlySet<string>
  /** 中止を除いた既存の公演（下書きを作る月の前後 7 日を含む、全店舗） */
  existingEvents: ExistingEvent[]
  blockedSlots: BlockedSlot[]
  scenarios: DraftScenario[]
  /** 日付・時間帯ごとの開始・終了の既定（公演時間帯設定）。holiday は土日祝か（holidays と同じ判定） */
  slotTimes: (date: string, slot: TimeSlotEn, holiday: boolean) => { start_time: string; end_time: string }
  /** 入れ替え候補として返す最大件数 */
  alternativeCount?: number
}

export function eventSlot(event: Pick<ExistingEvent, 'time_slot' | 'start_time'>): TimeSlotEn {
  const fromLabel = scheduleTimeSlotToEn(event.time_slot)
  if (fromLabel) return fromLabel
  if (event.time_slot === 'morning' || event.time_slot === 'afternoon' || event.time_slot === 'evening') return event.time_slot
  return startTimeToEn(event.start_time)
}

/** その日に使う固定枠の weekday（祝日で祝日の行があれば 7、無ければ曜日） */
export function ruleWeekdayFor(date: string, storeId: string, rules: SlotRule[], holidays: ReadonlySet<string>): number {
  const dow = getJstWeekdayIndex(date) ?? 0
  if (holidays.has(date) && rules.some(r => r.store_id === storeId && r.weekday === HOLIDAY_WEEKDAY)) {
    return HOLIDAY_WEEKDAY
  }
  return dow
}

export function isOpenSlot(date: string, storeId: string, slot: TimeSlotEn, rules: SlotRule[], holidays: ReadonlySet<string>): boolean {
  const weekday = ruleWeekdayFor(date, storeId, rules, holidays)
  return rules.some(r => r.store_id === storeId && r.weekday === weekday && r.time_slot === slot && r.is_open)
}

export function isWeekendOrHoliday(date: string, holidays: ReadonlySet<string>): boolean {
  const dow = getJstWeekdayIndex(date)
  return dow === 0 || dow === 6 || holidays.has(date)
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(v => parseInt(v, 10))
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(total, 24 * 60 - 1))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/** 作品の公演時間から終了時刻を出す（公演時間が分からなければ時間帯の既定） */
export function resolveEndTime(startTime: string, slotEnd: string, scenario: DraftScenario | null, weekend: boolean): string {
  const minutes = scenario ? (weekend && scenario.weekend_duration_minutes ? scenario.weekend_duration_minutes : scenario.duration_minutes) : 0
  if (!minutes || minutes <= 0) return slotEnd
  return fromMinutes(toMinutes(startTime) + minutes)
}

function withinPeriod(date: string, scenario: DraftScenario): boolean {
  if (scenario.available_from && date < scenario.available_from) return false
  if (scenario.available_until && date > scenario.available_until) return false
  return true
}

function storeAllowed(storeId: string, scenario: DraftScenario): boolean {
  return scenario.available_stores.length === 0 || scenario.available_stores.includes(storeId)
}

interface Placement {
  date: string
  store_id: string
  scenario_master_id: string | null
  /** 開始・終了（分）。分からなければ null（時間帯の重なりだけで見る） */
  start_min: number | null
  end_min: number | null
}

/** 案の枠の開始時刻と、終了時刻を出すための情報 */
export interface SlotTiming {
  start_time: string
  slot_end_time: string
  weekend: boolean
}

function overlapsAny(date: string, storeId: string, startMin: number, endMin: number, placements: Placement[]): boolean {
  return placements.some(p =>
    p.date === date && p.store_id === storeId && p.start_min !== null && p.end_min !== null &&
    startMin < p.end_min && p.start_min < endMin,
  )
}

function placementOf(date: string, storeId: string, scenarioId: string | null, start: string | null | undefined, end: string | null | undefined): Placement {
  const startMin = start ? toMinutes(start) : null
  let endMin = end ? toMinutes(end) : null
  if (startMin !== null && endMin !== null && endMin <= startMin) endMin += 24 * 60
  return { date, store_id: storeId, scenario_master_id: scenarioId, start_min: startMin, end_min: startMin !== null ? endMin : null }
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00+09:00`) - Date.parse(`${b}T00:00:00+09:00`)) / 86400000)
}

/**
 * 1 つの枠について、条件に合う作品を点数の高い順に並べる。
 * 条件（外せない）: メインGMがいる・その店舗で公演できる・公演期間内・同じ日のキット数を超えない・同じ店舗で 7 日以内に同じ作品がない・
 * （timing があれば）同じ店舗の別の公演と実際の時間が重ならない。
 * 点数: 予約の入りやすさ ＋ 新作 − その月に入れた回数。
 */
export function rankScenariosForSlot(
  date: string,
  storeId: string,
  scenarios: DraftScenario[],
  placements: Placement[],
  monthCounts: ReadonlyMap<string, number>,
  timing?: SlotTiming,
): Array<{ scenario: DraftScenario; score: number }> {
  const sameDateCounts = new Map<string, number>()
  for (const p of placements) {
    if (p.date === date && p.scenario_master_id) sameDateCounts.set(p.scenario_master_id, (sameDateCounts.get(p.scenario_master_id) ?? 0) + 1)
  }
  const ranked: Array<{ scenario: DraftScenario; score: number }> = []
  for (const scenario of scenarios) {
    if (scenario.main_gm_count <= 0) continue
    if (!storeAllowed(storeId, scenario)) continue
    if (!withinPeriod(date, scenario)) continue
    if ((sameDateCounts.get(scenario.scenario_master_id) ?? 0) >= Math.max(1, scenario.kit_count)) continue
    const tooClose = placements.some(p =>
      p.store_id === storeId &&
      p.scenario_master_id === scenario.scenario_master_id &&
      Math.abs(daysBetween(p.date, date)) < SAME_STORE_GAP_DAYS,
    )
    if (tooClose) continue
    if (timing) {
      const startMin = toMinutes(timing.start_time)
      const endMin = toMinutes(resolveEndTime(timing.start_time, timing.slot_end_time, scenario, timing.weekend))
      if (overlapsAny(date, storeId, startMin, endMin > startMin ? endMin : startMin + 1, placements)) continue
    }
    const score = scenario.demand_score + (scenario.is_new ? 0.5 : 0) - 0.3 * (monthCounts.get(scenario.scenario_master_id) ?? 0)
    ranked.push({ scenario, score })
  }
  ranked.sort((a, b) => b.score - a.score || a.scenario.title.localeCompare(b.scenario.title, 'ja'))
  return ranked
}

function reasonsFor(scenario: DraftScenario, monthCount: number): string[] {
  const reasons: string[] = []
  if (scenario.is_new) reasons.push('新作')
  if (scenario.demand_score >= 0.6) reasons.push('予約が入りやすい')
  if (monthCount === 0) reasons.push('今月まだ入っていない')
  reasons.push(`回せるGM ${scenario.main_gm_count}人`)
  return reasons
}

/**
 * 固定枠の空いている枠に作品を当てた下書き案を作る。日付の早い順・時間帯順・店舗順に 1 枠ずつ決める。
 */
export function generateDraftProposals(input: GenerateDraftInput): DraftProposal[] {
  const alternativeCount = input.alternativeCount ?? 5
  const occupied = new Set<string>()
  const placements: Placement[] = []
  const monthDates = new Set(input.dates)
  const monthCounts = new Map<string, number>()

  for (const e of input.existingEvents) {
    occupied.add(`${e.date}|${e.store_id}|${eventSlot(e)}`)
    placements.push(placementOf(e.date, e.store_id, e.scenario_master_id, e.start_time, e.end_time))
    if (e.scenario_master_id && monthDates.has(e.date)) {
      monthCounts.set(e.scenario_master_id, (monthCounts.get(e.scenario_master_id) ?? 0) + 1)
    }
  }
  for (const b of input.blockedSlots) occupied.add(`${b.date}|${b.store_id}|${b.time_slot}`)

  const proposals: DraftProposal[] = []
  for (const date of input.dates) {
    const weekend = isWeekendOrHoliday(date, input.holidays)
    for (const slot of AUTO_DRAFT_SLOTS) {
      for (const storeId of input.storeIds) {
        const key = `${date}|${storeId}|${slot}`
        if (occupied.has(key)) continue
        if (!isOpenSlot(date, storeId, slot, input.rules, input.holidays)) continue

        const times = input.slotTimes(date, slot, weekend)
        const timing: SlotTiming = { start_time: times.start_time, slot_end_time: times.end_time, weekend }
        const ranked = rankScenariosForSlot(date, storeId, input.scenarios, placements, monthCounts, timing)
        const chosen = ranked[0]?.scenario ?? null
        const endTime = resolveEndTime(times.start_time, times.end_time, chosen, weekend)
        if (chosen) {
          placements.push(placementOf(date, storeId, chosen.scenario_master_id, times.start_time, endTime))
          monthCounts.set(chosen.scenario_master_id, (monthCounts.get(chosen.scenario_master_id) ?? 0) + 1)
        }
        occupied.add(key)
        proposals.push({
          key,
          date,
          store_id: storeId,
          time_slot: slot,
          start_time: times.start_time,
          end_time: endTime,
          slot_end_time: times.end_time,
          is_weekend: weekend,
          scenario: chosen,
          alternatives: ranked.slice(1, 1 + alternativeCount).map(r => r.scenario),
          reasons: chosen ? reasonsFor(chosen, (monthCounts.get(chosen.scenario_master_id) ?? 1) - 1) : ['条件に合う作品がありません'],
        })
      }
    }
  }
  return proposals
}

export interface DraftSelection {
  proposal: DraftProposal
  scenario: DraftScenario
}

/**
 * 登録する直前に、選んだ案どうし・既存の公演と組み合わせて条件を確かめ直す（作品を入れ替えると崩れることがあるため）。
 * 日付の早い順に見て、条件に合わない案の key と理由を返す。終了時刻は選んだ作品の公演時間で出し直す。
 */
export function findSelectionConflicts(selections: DraftSelection[], existingEvents: ExistingEvent[]): Map<string, string> {
  const placements: Placement[] = existingEvents.map(e => placementOf(e.date, e.store_id, e.scenario_master_id, e.start_time, e.end_time))
  const conflicts = new Map<string, string>()
  const ordered = [...selections].sort((a, b) =>
    a.proposal.date.localeCompare(b.proposal.date) || a.proposal.start_time.localeCompare(b.proposal.start_time) || a.proposal.key.localeCompare(b.proposal.key))
  for (const { proposal, scenario } of ordered) {
    const id = scenario.scenario_master_id
    const endTime = resolveEndTime(proposal.start_time, proposal.slot_end_time, scenario, proposal.is_weekend)
    const self = placementOf(proposal.date, proposal.store_id, id, proposal.start_time, endTime)
    const sameDate = placements.filter(p => p.date === proposal.date && p.scenario_master_id === id).length
    let reason: string | null = null
    if (sameDate >= Math.max(1, scenario.kit_count)) {
      reason = `同じ日にキットの数（${Math.max(1, scenario.kit_count)}）を超えます`
    } else if (placements.some(p => p.store_id === proposal.store_id && p.scenario_master_id === id && Math.abs(daysBetween(p.date, proposal.date)) < SAME_STORE_GAP_DAYS)) {
      reason = `同じ店舗で${SAME_STORE_GAP_DAYS}日以内に同じ作品があります`
    } else if (self.start_min !== null && self.end_min !== null && overlapsAny(proposal.date, proposal.store_id, self.start_min, self.end_min, placements)) {
      reason = '同じ店舗の別の公演と時間が重なります'
    }
    if (reason) conflicts.set(proposal.key, reason)
    else placements.push(self)
  }
  return conflicts
}

export interface DemandEvent {
  date: string
  category: string
  scenario_master_id: string | null
  current_participants: number | null
  max_participants: number | null
}

/**
 * 直近の公演から作品ごとの「予約の入りやすさ」（0〜1）を出す。
 * オープン公演の席の埋まり具合（6 割）と貸切の件数（4 割、いちばん多い作品を 1 とする）。
 */
export function computeDemandScores(events: DemandEvent[]): Map<string, number> {
  const fill = new Map<string, { sum: number; n: number }>()
  const privateCounts = new Map<string, number>()
  for (const e of events) {
    if (!e.scenario_master_id) continue
    if (e.category === 'open' && e.max_participants && e.max_participants > 0) {
      const f = fill.get(e.scenario_master_id) ?? { sum: 0, n: 0 }
      f.sum += Math.min(1, Math.max(0, (e.current_participants ?? 0) / e.max_participants))
      f.n += 1
      fill.set(e.scenario_master_id, f)
    } else if (e.category === 'private') {
      privateCounts.set(e.scenario_master_id, (privateCounts.get(e.scenario_master_id) ?? 0) + 1)
    }
  }
  const maxPrivate = Math.max(1, ...privateCounts.values())
  const ids = new Set([...fill.keys(), ...privateCounts.keys()])
  const scores = new Map<string, number>()
  for (const id of ids) {
    const f = fill.get(id)
    const fillRate = f && f.n > 0 ? f.sum / f.n : null
    const privateRate = (privateCounts.get(id) ?? 0) / maxPrivate
    const score = fillRate === null ? privateRate : 0.6 * fillRate + 0.4 * privateRate
    scores.set(id, Math.round(score * 1000) / 1000)
  }
  return scores
}

/** 月の全日（YYYY-MM-DD）。today より前の日は含めない */
export function monthDatesFrom(start: string, end: string, today: string): string[] {
  const dates: string[] = []
  let d = start < today ? today : start
  while (d <= end) {
    dates.push(d)
    d = addJstDays(d, 1)
  }
  return dates
}
